function (path) {
    return new Promise(async (resolve, reject) => {
        let ggee = null;

        if (!path || path === undefined) {
            path = null;
        }
        const bsize = 48

        const drawRoundedRectIcon = (xx, grid, ctx, mo, md, img) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let rectWidth = bsize;
            let rectHeight = bsize;
            let cornerRadius = 5;

            ctx.fillStyle = 'lightCyan';
            if (mo) {
                ctx.fillStyle = 'cyan';
            }
            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';

            ctx.beginPath();
            ctx.moveTo(buttonX + cornerRadius, buttonY);
            ctx.arcTo(buttonX + rectWidth, buttonY, buttonX + rectWidth, buttonY + rectHeight, cornerRadius);
            ctx.arcTo(buttonX + rectWidth, buttonY + rectHeight, buttonX, buttonY + rectHeight, cornerRadius);
            ctx.arcTo(buttonX, buttonY + rectHeight, buttonX, buttonY, cornerRadius);
            ctx.arcTo(buttonX, buttonY, buttonX + rectWidth, buttonY, cornerRadius);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.clip();
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            if (img) {
                ctx.drawImage(img, buttonX, buttonY, rectWidth, rectHeight);
            }

            ctx.restore();

            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

        }

        let progressBar;
        let w = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 1,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }
        await showWidget(w)
        progressBar(20);

        const MSGraph = await exec('lib/msgraph.js');
        if (!MSGraph.isLoggedIn() && (!path || !path.endsWith('.bjb'))) {

            window.history.pushState({ 'rna-screen': {} }, 'init', `/app/baja/yak`);

            let plate_panel = {
                wid: 'card',
                width: '100%',
                data: {
                    cards: [
                        [
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: `

                                        <center style="cursor: pointer;">
  <img width="200" src="/assets/img/icons/png/yak.svg" />
  <br>
</center>
`
                                }
                            }

                        ]]
                }
            }

            progressBar(100);
            clear();
            showWidget(plate_panel)

            let buttons = [
                {
                    x: 1, y: 0, label: 'RNA', ionFunction: createIonFunction(async () => {

                        login();

                    }), icon: '/assets/img/icons/png/dna.svg', mouseOver: createIonFunction(() => {
                    }), draw: (grid, ctx, mo, md, img) => {
                        drawRoundedRectIcon(1, grid, ctx, mo, md, img)
                    }
                },
                {
                    x: 3, y: 0, label: 'Analysis', "ionFunction": createIonFunction(async () => {
                        setTimeout(() => {
                            let you = showModal({
                                wid: 'youtube',
                                data: {

                                    url: 'https://www.youtube.com/watch?v=NUNyTfNIkcs&feature=youtu.be'
                                }
                            }, 700, 500)

                        }, 500)

                    }), icon: '/assets/img/icons/png/question.svg', mouseOver: createIonFunction(() => {
                    }), draw: (grid, ctx, mo, md, img) => {
                        drawRoundedRectIcon(3, grid, ctx, mo, md, img)
                    }
                },
                {
                    x: 5, y: 0, label: 'Price', "ionFunction": createIonFunction(async () => {

                        let checkoutpanel = await exec('baja/datayak/checkout', 7500.00)
                        setTimeout(() => {
                            clear();
                            showWidget(checkoutpanel)
                        }, 500)

                    }), icon: '/assets/img/icons/png/price.svg', mouseOver: createIonFunction(() => {
                    }), draw: (grid, ctx, mo, md, img) => {
                        drawRoundedRectIcon(5, grid, ctx, mo, md, img)
                    }
                },
            ]

            let button_canvas = {
                wid: 'button-canvas',
                width: '100%',

                data: {
                    'style.justifyContent': 'center',
                    'title': 'controls',
                    'height': 100,
                    'width': 500,
                    'grid': {
                        xmin: 0,
                        xmax: 7,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': buttons
                }
            }

            showWidget(button_canvas)

        }
        else {

            if (window['env']['auth'] === 'b2c') {

                let host_ = window['env']['apiUrl']
                const jsonobj = {
                    email: getUser()
                };

                let rs = await POSTJSON(jsonobj, host_ + '/verify-user');
                progressBar(30);
                if (window['env']['auth'] !== 'b2c') {
                    rs.status = 'ptx_active'
                }
                if (rs.status === 'ptx_active') {
                    ggee = true;
                    rs.status = 'active'
                }
            }

            let __path = path;
            if (!__path) {
                __path = '/' + getUser()
            }

            if (__path.endsWith('.bjb')) {
                clear();
                let config = {
                    silent: true,
                    user: getUser(),
                    mode: 'viewer'
                }
                window.history.pushState({ 'yak': __path }, 'editor', `/app/baja/yakview?path=${__path}`);
                exec('baja/table/yakgen', __path, config)
                return
            }
            return resolve()
        }
    })
}
