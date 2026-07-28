function (pt, x, y) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;

        let selectP;
        let selectPanel = createIonFunction(async (_panel) => {
            selectP = _panel;
        });

        r = createIonFunction((p) => {
            editor = p;
        })
        menuList.push({
            label: `Create replicate`,
            click: (scx, scy) => {

            },
            move: () => {
            }
        });
        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
