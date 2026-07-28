function () {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js')

        class FlexiMenu {
            grid;

            menus = {};
            ulr = window['env']['apiUrl'] + '/ionworks/list-installed-files'
            filterMethod;

            getFileExtension(name) {
                let end = name.substring(name.lastIndexOf('.'));
                end = end.toLowerCase();
                if (end.indexOf('.bed.gz')) {
                    return 'BED'
                } else if (end.indexOf('bed')) {
                    return end;
                }
                return end;
            }

            async load() {

                let js = await GETJSON(url);
                let menuList = []

                for (let j of js) {
                    let name = j.substring(0, j.lastIndexOf('.'));
                    let ext = getFileExtension(j);
                    let x = 0;
                    let y = 0;
                    let menu = new Menu(menuList, x, y)

                    menuList.push({
                        label: j,
                        click: (xwc, ywc) => {
                        },
                        move: () => {
                        }
                    });
                }
                menu.menu_width = 200;
                this.menus[ext] = menu;
            }

            draw(ctx) {

                let width = ctx.canvas.width;
                let height = ctx.canvas.height;

                this.grid.width = width;
                this.grid.height = height;

                this.grid.rescale();

            }
        }
        resolve(FlexiMenu)
    })
}
