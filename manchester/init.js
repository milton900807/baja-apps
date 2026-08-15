function () {
    clear();

    window.history.pushState('', '', `/`);
    exec('lib/msgraph.js').then(async (MSGraph) => {
        if (!MSGraph.isLoggedIn()) {
            function clearBrowserCache() {
                const resources = document.querySelectorAll('link, script');
                resources.forEach((res) => {
                    if (res.tagName === 'LINK' && res.href) {
                        res.href += (res.href.includes('?') ? '&' : '?') + 'no-cache=' + new Date().getTime();
                    } else if (res.tagName === 'SCRIPT' && res.src) {
                        res.src += (res.src.includes('?') ? '&' : '?') + 'no-cache=' + new Date().getTime();
                    }
                });
            }

            clearBrowserCache()

            let ww = {
                wid: 'simple-file-browser',
                width: '100%',
                height: '100%',
                data: {
                    width: '100%',
                    root: '/',
                    drive: 'user',
                    user: getUser(),
                    root: '/' + getUser(),
                    columns: 3,
                    showSearch: false,
                    "ionfunction.fileClick": createIonFunction(async (element) => {
                        clear();
                        exec('manchester/view', element.path)
                    }),
                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                    }
                    ),
                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                        console.log(" path " + path);

                    })
                }
            }

            let data_drop = {
                wid: 'file-drop',
                data: {
                    onDropFunction: createIonFunction(() => {

                    })
                }
            }

            let plate_panel = {
                wid: 'card',
                componentRef: 'bottomPanel',
                data: {
                    height: '800px',
                    cards: [
                        [
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: `

                                    <center> <img  width="200"  src="/assets/yak.png">
                                    </center>
                                    `
                                }
                            },
                            {
                                'width': '100%',
                                'component': ww
                            },

                        ]]
                }
            }
            showWidget(plate_panel)

        } else {
            exec('manchester/fb')
        }
    })

}
