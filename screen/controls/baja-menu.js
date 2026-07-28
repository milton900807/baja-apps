function (pm) {


    return new Promise(async (resolve) => {
        const ai_create_file_items = [];
        function makeAiCreateItem(label, handlerAsync) {
            return {
                label,
                ionfunction: createIonFunction(handlerAsync),
                click: () => handlerAsync()
            };
        }
        const MSGraph = await exec('lib/msgraph');
        if (!MSGraph.isLoggedIn()) {
            ai_create_file_items.push(
                makeAiCreateItem("Login", async () => {
                    login();
                })
            );

            ai_create_file_items.push(
                makeAiCreateItem("Bookshelf", async () => {
                    clear();
                    window.history.pushState({}, "", "/app/baja/bookshelf");
                    await exec("bookshelf/browser");
                })
            );
            resolve(ai_create_file_items);
        } else {
            ai_create_file_items.push(
                makeAiCreateItem("Files", async () => {
                    clear();
                    window.history.pushState({}, "", "/app/baja/fb");
                    await exec("files/browser");
                })
            );

            //
            // Apps
            //
            ai_create_file_items.push(
                makeAiCreateItem("Apps", async () => {
                    clear();
                    window.history.pushState({}, "", "/app/apps");
                    await exec("apps/browser");
                })
            );

            //
            // Bookshelf
            //
            ai_create_file_items.push(
                makeAiCreateItem("Bookshelf", async () => {
                    clear();
                    window.history.pushState({}, "", "/app/bookshelf");
                    await exec("bookshelf/browser");
                })
            );

            resolve(ai_create_file_items);
        }
    });
}

